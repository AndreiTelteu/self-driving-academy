import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '137-metric-service'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

/**
 * The throughput probe is machine-local, so `--check` compares the transcript with its measured
 * numbers nulled. Everything else in the report is deterministic.
 */
function stableReport(report) {
  return {
    ...report,
    performance: {
      ...report.performance,
      ingestMs: null,
      snapshotMs: null,
      perEventMs: null,
      perSnapshotMs: null,
      eventsPerSecond: null,
    },
  };
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'experiments', 'metric-service-report.ts')).href
  ),
  report = reportModule.runMetricServiceReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  stableJson = `${JSON.stringify(stableReport(report), null, 2)}\n`,
  markdown = reportModule.metricServiceReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, scenarios ${report.scenarios.length}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST ingest ${report.performance.ingestMs.toFixed(3)} ms for ${report.performance.events} events (${report.performance.perEventMs.toFixed(5)} ms/event), snapshots ${report.performance.snapshotMs.toFixed(3)} ms for ${report.performance.snapshots} (${report.performance.perSnapshotMs.toFixed(5)} ms/snapshot) — machine-local, provisional`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (`${JSON.stringify(stableReport(JSON.parse(saved)), null, 2)}\n` !== stableJson) {
    console.error(`Metric service report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Metric service report is current: ${output}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
