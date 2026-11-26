import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '270-company-dashboard'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'ui', 'company-dashboard-report.ts')).href
  ),
  report = reportModule.runCompanyDashboardReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.companyDashboardReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, ` +
    `months ${report.metrics.monthsWithData}/${report.metrics.months} with data, ` +
    `cash ${report.purchase.cashBeforeMinorUnits}->${report.purchase.cashAfterMinorUnits}, ` +
    `service ${report.upgrade.monthZeroServiceMinorUnits}->${report.upgrade.nextMonthServiceMinorUnits}, ` +
    `overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const savedJson = await readFile(output, 'utf8'),
    savedMarkdown = await readFile(reportMarkdown, 'utf8');
  const stale = [];
  if (savedJson !== json) stale.push(output);
  if (savedMarkdown !== markdown) stale.push(reportMarkdown);
  if (stale.length > 0) {
    console.error(`Company dashboard report is stale: ${stale.join(', ')}`);
    process.exitCode = 1;
  } else console.log(`Company dashboard report is current: ${output}`);
} else {
  await mkdir(evidence, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
