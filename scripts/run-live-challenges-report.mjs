import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '277-live-challenges'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'missions', 'live-challenges-report.ts')).href
  ),
  report = reportModule.runLiveChallengesReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.liveChallengesReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `OFFER visible ${report.offer.visibleOffers}, cooldown ${report.offer.cooldownTicks}, passenger ${report.offer.passengerRefusal}`,
);
console.log(
  `REWARD first ${report.reward.firstXp} XP/${report.reward.firstEntries} row, duplicate ${report.reward.secondXp} XP/${report.reward.secondEntries} rows`,
);
console.log(
  `RECORDS ${report.records.rows}, chaos ${report.chaos.xp} XP, reload ${report.reload.restored} ${report.reload.xp} XP`,
);
console.log(`STORAGE ${report.storage.checkpointBytes} code units, ${report.storage.persistence}`);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Live challenge report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Live challenge report is current: ${output}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
