import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '269-company-evolution'),
  reportJson = join(directory, 'cost.json'),
  reportMarkdown = join(directory, 'cost.md');

const costModule = await import(
    pathToFileURL(join(root, 'tests', 'economy', 'company-evolution-cost.ts')).href
  ),
  report = costModule.measureCompanyEvolutionCost(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = costModule.companyEvolutionCostMarkdown(report);

await mkdir(directory, { recursive: true });
await writeFile(reportJson, json);
await writeFile(reportMarkdown, markdown);
console.log(
  `Company evolution cost: read p95 ${report.read.p95Ms} ms, ride p95 ${report.rideWithModifier.p95Ms} ms, ` +
    `budget ${report.protocol.budgetMs} ms, ${report.pass ? 'PASS' : 'FAIL'}`,
);
console.log(`Wrote ${reportJson}`);
console.log(`Wrote ${reportMarkdown}`);
if (!report.pass) process.exitCode = 1;
