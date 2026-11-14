import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '199-v3-walking-tutorial'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function metres(value) {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '0';
  return Math.abs(value) < 1e-6 ? value.toExponential(2) : value.toFixed(2);
}

function yesNo(value) {
  return value ? 'DA' : 'NU';
}

const suite = await import(
    pathToFileURL(join(root, 'tests', 'missions', 'walking-tutorial-report.ts')).href
  ),
  started = process.hrtime.bigint(),
  report = suite.runWalkingTutorialReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = suite.walkingTutorialReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const row of report.positive)
  console.log(
    `${row.advanced ? 'PASS' : 'FAIL'} step ${row.order} ${row.stepId} <- ${row.event} (${row.source}) at tick ${row.tick}`,
  );
for (const row of report.negative)
  if (!row.pass)
    console.log(`FAIL negative ${row.stepId} <- ${row.eventFed}: ${row.status} ${row.reason}`);
console.log(
  `SUMMARY steps ${report.summary.positives}/${report.summary.steps}, negatives ${report.summary.negatives}, compatibility ${report.summary.compatibility ? 'PASS' : 'FAIL'} (231 ${report.compatibility.before.challengeCatalog}, 188 ${report.compatibility.before.extendedCatalog}, daily ${report.compatibility.before.daily}, fleet ${report.compatibility.before.access}), learning ${report.summary.noLearning ? 'PASS' : 'FAIL'} (witness ${report.learning.witnessWalkTicks} ticks -> ${report.learning.witnessWalkCandidates} candidates, control ${report.learning.witnessControlCandidates}), replay ${report.replay.identical ? 'identical' : 'DIFFERENT'}, checks ${report.summary.passed}/${report.summary.checks}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `WALK ${report.learning.walkingTicks} ticks / ${metres(report.learning.walkingDistanceM)} m, abandoned ${report.abandoned.state} at step ${report.abandoned.stepIndex}/${report.abandoned.steps}, taxi ${report.fixture.taxiId} door ${metres(report.fixture.doorDistanceM)} m, negative probes ${yesNo(report.negative.every((row) => row.pass))}`,
);
console.log(
  `COST local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);
console.log(`DIGEST sha256 ${report.determinism.digest}`);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Walking tutorial report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Walking tutorial report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown) {
    console.error(`Walking tutorial markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Walking tutorial markdown is current: ${reportMarkdown}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
