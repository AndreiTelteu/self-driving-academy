import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '174-v2-signal-learning'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const suite = await import(
    pathToFileURL(join(root, 'tests', 'learning', 'signal-v2-estimator-report.ts')).href
  ),
  report = suite.runSignalEstimatorReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = suite.signalEstimatorReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const check of report.checks)
  console.log(`${check.pass ? 'PASS' : 'FAIL'} CHECK ${check.id} (${check.detail})`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, candidate ${report.summary.candidateKeys}, unobserved ${report.summary.unobservedKeys}, digest ${report.determinism.digest}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Signal learning report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Signal learning report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown) {
    console.error(`Signal learning markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Signal learning markdown is current: ${reportMarkdown}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
