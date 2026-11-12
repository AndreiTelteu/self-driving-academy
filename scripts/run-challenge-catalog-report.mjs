import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '231-challenge-catalog'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'missions', 'challenge-catalog-report.ts')).href
  ),
  report = reportModule.runChallengeCatalogReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.challengeCatalogReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, templates ${report.contract.templates}, families ${Object.keys(report.catalog.families).length}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `ELIGIBILITY lean ${report.eligibility.lean.eligible}/${report.eligibility.lean.excluded} excluded, Academy ${report.eligibility.academy.eligible}/${report.eligibility.academy.excluded}, Haos ${report.eligibility.chaos.eligible}/${report.eligibility.chaos.excluded}`,
);
console.log(
  `EVALUATIONS passing ${report.evaluations.passing.filter((entry) => entry.status === 'PASSED').length}/12, failing ${report.evaluations.failing.filter((entry) => entry.status !== 'PASSED').length}/12, drift valid ${report.drift.validSeconds}s rotation ${report.drift.rotationOnlySeconds}s collision ${report.drift.collisionSeconds}s`,
);
console.log(
  `PERFORMANCE evaluations ${report.performance.simulation.evaluations}, factRows ${report.performance.simulation.factRowsExamined}, catalogBytes ${report.performance.memory.catalogBytes}, factsBytes ${report.performance.memory.maxFactsBytes}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Challenge catalog report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Challenge catalog report is current: ${output}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
