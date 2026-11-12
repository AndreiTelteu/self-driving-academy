import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '233-challenge-experience'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'missions', 'challenge-experience-report.ts')).href
  ),
  report = reportModule.runChallengeExperienceReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.challengeExperienceReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `CREDIT rows ${report.credit.length}, credited ${report.credit.filter((entry) => entry.status === 'CREDITED').length}, duplicates ${report.credit.filter((entry) => entry.status === 'DUPLICATE').length}, skipped ${report.credit.filter((entry) => entry.status === 'SKIPPED').length}`,
);
console.log(
  `RECORDS comparisons ${report.records.rows.map((entry) => entry.comparison).join(',')}, template ${report.records.templateId}`,
);
console.log(
  `RETRY attempt ${report.retry.rows[0].attempt}, newIdentity ${report.retry.rows[0].newIdentity}, creditedAfterRetry ${report.retry.creditedAfterRetry}, duplicate ${report.retry.duplicateAfterRetry}`,
);
console.log(
  `DAILY days ${report.daily.length}, picks ${report.daily[0].templates.length}, bridge ${report.connection.bridgeVersion}, expressible ${report.connection.expressible}, deferred ${report.connection.deferred}`,
);
console.log(
  `STORAGE snapshotBytes ${report.storage.snapshotBytes}, ledgerEntries ${report.storage.ledgerEntries}, recordsCap ${report.performance.storage.recordRowsCap}, keysCap ${report.performance.storage.rewardedKeysCap}, manifest challengeHistoryEntries ${report.storage.manifestChallengeHistoryEntries}`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Challenge experience report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Challenge experience report is current: ${output}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
