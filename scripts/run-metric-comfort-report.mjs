import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '139-metric-comfort'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

/**
 * The cost probe is machine-local, so `--check` compares the transcript with its measured numbers
 * nulled. Everything else in the report is deterministic. The projection lives in the report module
 * itself, so the test and the script compare exactly the same document.
 */

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'experiments', 'comfort-metrics-report.ts')).href
  ),
  report = reportModule.runComfortMetricsReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  stableJson = `${JSON.stringify(reportModule.comfortMetricsStableReport(report), null, 2)}\n`,
  markdown = reportModule.comfortMetricsReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, scenarios ${report.scenarios.length}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST ingest ${report.performance.ingestMs.toFixed(3)} ms for ${report.performance.intervals} intervals (${report.performance.perIntervalMs.toFixed(6)} ms/interval), snapshots ${report.performance.snapshotMs.toFixed(3)} ms for ${report.performance.snapshots} (${report.performance.perSnapshotMs.toFixed(6)} ms/snapshot) — machine-local, provisional`,
);
for (const mode of Object.keys(report.performance.perModePerIntervalMs))
  console.log(
    `COST mode ${mode} ${report.performance.perModeIngestMs[mode].toFixed(3)} ms (${report.performance.perModePerIntervalMs[mode].toFixed(6)} ms/interval)`,
  );
console.log(
  `COST invisible taxi ${report.performance.invisibleTaxiIngestMs.toFixed(3)} ms for ${report.performance.invisibleTaxiIntervals} intervals (${report.performance.invisibleTaxiPerIntervalMs.toFixed(6)} ms/interval)`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  const savedStable = reportModule.comfortMetricsStableReport(JSON.parse(saved));
  if (`${JSON.stringify(savedStable, null, 2)}\n` !== stableJson) {
    console.error(`Comfort metrics report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Comfort metrics report is current: ${output}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
