import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '268-company-finance'),
  reportJson = join(directory, 'cost.json'),
  reportMarkdown = join(directory, 'cost.md');

const costModule = await import(
    pathToFileURL(join(root, 'tests', 'economy', 'company-finance-cost.ts')).href
  ),
  report = costModule.measureCompanyFinanceCost(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = costModule.companyFinanceCostMarkdown(report);

await mkdir(directory, { recursive: true });
await writeFile(reportJson, json);
await writeFile(reportMarkdown, markdown);
console.log(
  `Company finance cost: p50 ${report.companyStep.p50Ms} ms, p95 ${report.companyStep.p95Ms} ms, ` +
    `budget ${report.protocol.budgetMs} ms, ${report.pass ? 'PASS' : 'FAIL'}`,
);
console.log(`Wrote ${reportJson}`);
console.log(`Wrote ${reportMarkdown}`);
if (!report.pass) process.exitCode = 1;
