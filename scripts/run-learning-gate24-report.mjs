import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '108-learning-gate24'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'experiments', 'learning-gate24-report.ts')).href
  ),
  report = reportModule.runLearningGate24Report(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.learningGate24ReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, scenarios ${report.summary.scenarios}, gate ${report.summary.gateStatus}, unvalidated ${report.summary.unvalidated.length}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const savedJson = await readFile(output, 'utf8');
  const savedMarkdown = await readFile(reportMarkdown, 'utf8');
  if (savedJson !== json) {
    console.error(`Learning gate24 report is stale: ${output}`);
    process.exitCode = 1;
  } else if (savedMarkdown !== markdown) {
    console.error(`Learning gate24 markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else {
    console.log(`Learning gate24 report is current: ${output}`);
  }
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
