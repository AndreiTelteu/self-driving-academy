import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '228-destruction-feedback'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const manifest = JSON.parse(await readFile(join(root, 'Docs', 'performance-budgets.json'), 'utf8'));
const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'audio', 'destruction-feedback-report.ts')).href
  ),
  report = reportModule.runDestructionFeedbackReport({ manifest }),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.destructionFeedbackReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, materials ${report.materials.distinctProfiles}/6, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `LIVE reactions ${report.live.reactions}, audio ${report.live.audio.played}/${report.live.audio.refused}, fragments ${report.live.fragments.active}/${report.live.fragments.poolCap}`,
);
console.log(
  `REPLAY events ${report.replay.truth.replayedEvents}/${report.replay.truth.recordedEvents}, reactions ${report.replay.reactions}, fingerprints ${String(report.replay.fingerprints.identical)}, absent objects ${report.absent.silentObjects.length}`,
);
console.log(
  `BUDGET destructionBodies ${String(report.budget.destructionBodies)}, totalHeapBytes ${String(report.budget.totalHeapBytes)}, gaps ${report.budget.gaps.length}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Destruction feedback report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Destruction feedback report is current: ${output}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
