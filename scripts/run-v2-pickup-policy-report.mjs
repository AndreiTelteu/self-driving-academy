import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '185-v2-pickup-policy'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const suite = await import(
    pathToFileURL(join(root, 'tests', 'autonomy', 'pickup-policy-v2-report.ts')).href
  ),
  report = suite.runPickupPolicyReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = suite.pickupPolicyReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const check of report.checks)
  console.log(`${check.pass ? 'PASS' : 'FAIL'} CHECK ${check.id} (${check.detail})`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, effects ${report.effects.length}, separation ${report.separation.length}, couplings ${report.couplings.length}, safety ${report.safety.length}, grid ${report.preferenceGrid.cases - report.preferenceGrid.violations}/${report.preferenceGrid.cases}, digest ${report.determinism.digest}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Pickup policy report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Pickup policy report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown) {
    console.error(`Pickup policy markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Pickup policy markdown is current: ${reportMarkdown}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
