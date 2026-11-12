import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '227-destructible-decor'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'world', 'destructible-decor-report.ts')).href
  ),
  report = reportModule.runDestructibleDecorReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.destructibleDecorReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, zones ${report.playground.zones}, objects ${report.performance.simulation.objects}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `PLAYGROUND entries ${report.playground.entries}/${report.playground.drivableEntries} drivable, routes ${report.playground.routes}, destructibles ${report.playground.destructibles}`,
);
console.log(
  `DESTRUCTION bodies ${report.performance.simulation.bodies}, indexEntries ${report.performance.simulation.indexEntries}, evaluated ${report.performance.simulation.evaluatedObjects}, snapshotBytes ${report.checkpoint.bytes}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Destructible decor report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Destructible decor report is current: ${output}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
