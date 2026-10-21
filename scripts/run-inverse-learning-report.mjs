import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '105-inverse-learning'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'experiments', 'inverse-learning-report.ts')).href
  ),
  report = reportModule.runInverseLearningReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.inverseLearningReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, scenarios ${report.summary.scenarios}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const savedJson = await readFile(output, 'utf8');
  const savedMarkdown = await readFile(reportMarkdown, 'utf8');
  if (savedJson !== json) {
    console.error(`Inverse learning report is stale: ${output}`);
    process.exitCode = 1;
  } else if (savedMarkdown !== markdown) {
    console.error(`Inverse learning markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else {
    console.log(`Inverse learning report is current: ${output}`);
  }
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
