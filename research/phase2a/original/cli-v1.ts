import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { FROZEN_CRYPTO_SPEC, phase2AResultWithoutObservations, runPhase2AResearch, type ResearchBar } from "../../server/src/phase2a-research";

function valueAfter(flag: string): string | null { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] ?? null : null; }
function parseBars(text: string): ResearchBar[] {
  const trimmed = text.trim(); if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed) as ResearchBar[];
  return trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as ResearchBar);
}
function pct(value: number | null): string { return value === null ? "—" : `${(value * 100).toFixed(3)}%`; }

const inputPath = valueAfter("--input"); const outputDir = resolve(valueAfter("--out") ?? "research/phase2a/output");
if (!inputPath) throw new Error("Usage: bun research/phase2a/cli.ts --input <bars.json|bars.jsonl> --out <directory>. The normal command never accepts a holdout-open flag.");
if (process.argv.includes("--open-holdout") || process.argv.includes("--evaluate-holdout")) throw new Error("LOCKED_HOLDOUT: opening final holdout performance is outside Phase 2A.");
const bars = parseBars(await readFile(resolve(inputPath), "utf8")); const result = await runPhase2AResearch(bars); const summary = phase2AResultWithoutObservations(result);
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "frozen-config.json"), `${JSON.stringify(FROZEN_CRYPTO_SPEC, null, 2)}\n`),
  writeFile(resolve(outputDir, "dataset-manifest.json"), `${JSON.stringify({ specHash: result.specHash, datasetManifestHash: result.datasetManifestHash, ...result.dataset }, null, 2)}\n`),
  writeFile(resolve(outputDir, "validation-report.json"), `${JSON.stringify(summary, null, 2)}\n`),
  writeFile(resolve(outputDir, "validation-observations.jsonl"), `${result.observations.map((row) => JSON.stringify(row)).join("\n")}\n`),
  writeFile(resolve(outputDir, "holdout-lock.json"), `${JSON.stringify(result.holdout, null, 2)}\n`),
]);
const pooled = result.reports.filter((row) => row.fold === "pooled");
const report = [
  "# Phase 2A crypto validation report",
  "",
  `Generated: ${result.generatedAt}`,
  `Spec hash: \`${result.specHash}\``,
  `Dataset manifest hash: \`${result.datasetManifestHash}\``,
  `Rows: ${result.dataset.totalRows.toLocaleString()} across ${result.dataset.instruments.filter((row) => row.rows > 0).length} instruments`,
  "",
  "This is a survivor-sample exploratory OHLCV experiment. It is not a replay of the live dossier model, not a portfolio backtest, and not proof that shorts were executable.",
  "",
  "| Hypothesis | Horizon | Issued | Assets | Hit rate | Mean gross | Mean net (18 bps) | Mean net (36 bps) | Difference vs best full-schedule directional baseline | Difference vs best matched baseline | Selection |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ...pooled.map((row) => { const selected = result.selection.find((item) => item.horizon === row.horizon)?.selected === row.strategy ? "qualified for holdout review" : "not selected"; return `| ${row.strategy} | ${row.horizon}d | ${row.issuedDecisions} | ${row.uniqueAssets} | ${pct(row.directionalHitRate)} | ${pct(row.meanGrossSignedReturn)} | ${pct(row.meanCentralNetSignedReturn)} | ${pct(row.meanStressedNetSignedReturn)} | ${pct(row.fullScheduleBaselines.differenceVsBestDirectional)} | ${pct(row.matchedBaselines.differenceVsBestDirectional)} | ${selected} |`; }),
  "",
  "## Holdout",
  "",
  `Locked: yes. ${result.holdout.start} through ${result.holdout.end}. Feature-eligible rows counted without opening labels: ${result.holdout.featureEligibleRows}. Performance opened: no.`,
  "",
  "## Selection decisions",
  "",
  ...result.selection.map((row) => `- ${row.horizon}d: ${row.selected ?? "no qualified candidate"}. ${row.reason}`),
  "",
  "## Limitations",
  "",
  ...result.notes.map((note) => `- ${note}`),
  "",
].join("\n");
await writeFile(resolve(outputDir, "VALIDATION-REPORT.md"), report);
await writeFile(resolve(outputDir, "COMMAND.txt"), `bun research/phase2a/cli.ts --input ${resolve(inputPath)} --out ${outputDir}\n`);
console.log(JSON.stringify({ ok: true, outputDir, specHash: result.specHash, datasetManifestHash: result.datasetManifestHash, observationCount: result.observations.length, selection: result.selection, holdout: result.holdout }, null, 2));

// Keep output paths inside the selected directory even if the caller passes a nested path.
void dirname(outputDir);
