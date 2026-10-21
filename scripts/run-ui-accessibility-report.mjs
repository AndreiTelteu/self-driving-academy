import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '083-ui-accessibility'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'app', 'ui-accessibility-report.ts')).href
  ),
  report = reportModule.runUiAccessibilityReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.uiAccessibilityReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, scenarios ${report.scenarios.length}, overall ${report.summary.overall ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`UI accessibility report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`UI accessibility report is current: ${output}`);
} else {
  await mkdir(evidence, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.overall) process.exitCode = 1;
}
