import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '226-world-recovery'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md'),
  costOutput = join(directory, 'cost.json');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'persistence', 'world-recovery-report.ts')).href
  ),
  report = reportModule.runWorldRecoveryReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.worldRecoveryReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, recoveries ${report.recovery.status}, resets ${report.repeated.resets}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `RECOVERY ticksToMobility ${report.recovery.ticksToMobility}, colliderCount ${report.recovery.colliderCount}, xp ${report.recovery.xpBeforeMicroXp}->${report.recovery.xpAfterMicroXp}`,
);
console.log(
  `RESET epochs ${report.reset.epochs.worldEpoch}/${report.reset.epochs.learningEpoch}/${report.reset.epochs.economyEpoch}, bodies ${report.reset.bodies}, checkpointBytes ${report.reset.checkpointBytes}`,
);

if (process.argv.includes('--cost')) {
  const cost = reportModule.measureRecoveryCost(Number(argument('--cost-iterations') ?? 500));
  await mkdir(directory, { recursive: true });
  await writeFile(costOutput, `${JSON.stringify(cost, null, 2)}\n`);
  console.log(`Wrote ${costOutput}`);
}

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`World recovery report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`World recovery report is current: ${output}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
