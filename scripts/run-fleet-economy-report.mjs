import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '209-fleet-economy-reviews'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

/**
 * The 209 document is fully deterministic: it is produced by the real fleet/dispatcher/lifecycle/
 * comfort fixtures and contains no wall-clock or machine-local cost figure. `--check` therefore
 * compares the whole document, while the test imports the same module and asserts the same checks.
 */
const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'economy', 'economy-report.ts')).href
  ),
  report = reportModule.runFleetEconomyReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  stableJson = `${JSON.stringify(reportModule.fleetEconomyStableReport(report), null, 2)}\n`,
  markdown = reportModule.fleetEconomyReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, window rides efficient ${report.efficient.ridesInWindow} / aggressive ${report.aggressive.ridesInWindow}, ratings ${report.efficient.averageRating} / ${report.aggressive.averageRating}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `LEDGER completed ${report.kpi.dayCompletedRides}, failed ${report.kpi.dayFailedRides}, cancelled ${report.kpi.dayCancelledRides}, reviews ${report.kpi.dayReviewCount}, history scans ${report.kpi.historyScans}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8'),
    savedStable = reportModule.fleetEconomyStableReport(JSON.parse(saved));
  if (`${JSON.stringify(savedStable, null, 2)}\n` !== stableJson) {
    console.error(`Fleet economy report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Fleet economy report is current: ${output}`);
} else {
  await mkdir(dirname(output), { recursive: true });
  await mkdir(evidence, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
