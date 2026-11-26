import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '269-company-evolution'),
  reportJson = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'economy', 'company-evolution-report.ts')).href
  ),
  report = reportModule.runCompanyEvolutionReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.companyEvolutionReportMarkdown(report);

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, ` +
    `level ${report.purchase.levelAfter}, cash ${report.cash.cashMinorUnits} SDA, ` +
    `purchase ${report.purchase.offerId} ${report.purchase.costMinorUnits} SDA slot ${report.purchase.slot}, ` +
    `upgrade ${report.upgrade.upgradeId} ${report.upgrade.basisPoints} bp, ` +
    `service ${report.upgrade.currentPeriodServiceMinorUnits}→${report.upgrade.nextPeriodServiceMinorUnits} SDA, ` +
    `overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const savedJson = await readFile(reportJson, 'utf8').catch(() => null),
    savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
  if (savedJson !== json) console.error(`Company evolution report is stale: ${reportJson}`);
  if (savedMarkdown !== markdown)
    console.error(`Company evolution markdown is stale: ${reportMarkdown}`);
  if (savedJson !== json || savedMarkdown !== markdown) process.exitCode = 1;
  else console.log(`Company evolution report is current: ${reportJson}`);
  if (!report.summary.pass) process.exitCode = 1;
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(reportJson, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${reportJson}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
