import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '115-vertical-slice'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md');

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'app', 'vertical-slice-report.ts')).href
  ),
  report = await reportModule.runVerticalSliceEvidenceReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.verticalSliceEvidenceMarkdown(report);

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
for (const entry of report.rows) console.log(`${entry.status} ROW ${entry.row}`);
console.log(
  `SUMMARY rows ${report.summary.rows}, checks ${report.summary.passed}/${report.summary.checks}, determinism ${report.determinism.equal ? 'PASS' : 'FAIL'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(defaultOutput, 'utf8');
  const savedMarkdown = await readFile(reportMarkdown, 'utf8');
  if (saved !== json) {
    console.error(`Vertical slice report is stale: ${defaultOutput}`);
    process.exitCode = 1;
  }
  if (savedMarkdown !== markdown) {
    console.error(`Vertical slice Markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  }
  if (process.exitCode !== 1) console.log(`Vertical slice report is current: ${defaultOutput}`);
} else {
  await writeFile(defaultOutput, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${defaultOutput}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
