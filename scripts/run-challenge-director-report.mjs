import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '232-challenge-director'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'missions', 'challenge-director-report.ts')).href
  ),
  report = reportModule.runChallengeDirectorReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.challengeDirectorReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `PREFLIGHT scenarios ${report.preflight.length}, refusals ${report.performance.simulation.refusals}`,
);
console.log(
  `LIFECYCLE rows ${report.lifecycle.rows.length}, completed ${report.lifecycle.completed}, failed ${report.lifecycle.failed}, cancelled ${report.lifecycle.cancelled}, declined ${report.lifecycle.declined}, expired ${report.lifecycle.expired}`,
);
console.log(
  `SEED instance ${report.reload.templateId} seed ${report.reload.seed}, plan ${report.reload.samePlan}, deadline ${report.reload.sameDeadline}, fingerprint ${report.reload.sameFingerprint}`,
);
console.log(
  `PERFORMANCE offers ${report.performance.simulation.offers}, probes ${report.performance.simulation.routeProbes}, maxPerOffer ${report.performance.simulation.maxProbesPerOffer}, snapshotBytes ${report.performance.memory.snapshotBytes}, historyEntries ${report.history.entries}, dropped ${report.history.dropped}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Challenge director report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Challenge director report is current: ${output}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
