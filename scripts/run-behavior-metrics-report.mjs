import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '138-behavior-metrics'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'experiments', 'behavior-metrics-report.ts')).href
  ),
  report = reportModule.runBehaviorMetricsReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.behaviorMetricsReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, scenarios ${report.scenarios.length}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

/**
 * The transcript has no wall-clock timestamp, no random value and no machine-local measurement, so
 * `--check` is an exact staleness check instead of a projection with nulled numbers.
 */
if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (`${JSON.stringify(JSON.parse(saved), null, 2)}\n` !== json) {
    console.error(`Behavior metrics report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Behavior metrics report is current: ${output}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
