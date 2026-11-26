import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '268-company-finance'),
  reportJson = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'economy', 'company-finance-report.ts')).href
  ),
  report = reportModule.runCompanyFinanceReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.companyFinanceReportMarkdown(report);

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, ` +
    `profit ${report.cash.profitMinorUnits} SDA, cash ${report.cash.cashMinorUnits} SDA, ` +
    `ride cost ${report.profitableRide.grossCostMinorUnits} SDA, ` +
    `empty month ${report.emptyMonth.profitMinorUnits} SDA, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const savedJson = await readFile(reportJson, 'utf8').catch(() => null),
    savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
  if (savedJson !== json) console.error(`Company finance report is stale: ${reportJson}`);
  if (savedMarkdown !== markdown)
    console.error(`Company finance markdown is stale: ${reportMarkdown}`);
  if (savedJson !== json || savedMarkdown !== markdown) process.exitCode = 1;
  else console.log(`Company finance report is current: ${reportJson}`);
  if (!report.summary.pass) process.exitCode = 1;
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(reportJson, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${reportJson}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
