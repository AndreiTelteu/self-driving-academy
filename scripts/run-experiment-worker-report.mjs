import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '144-experiment-worker'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md'),
  costOutput = join(evidence, 'cost.json'),
  costMarkdown = join(evidence, 'cost.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const moduleUrl = pathToFileURL(
    join(root, 'tests', 'experiments', 'experiment-worker-report.ts'),
  ).href,
  reportModule = await import(moduleUrl),
  report = await reportModule.runExperimentWorkerReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.experimentWorkerReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, scenarios ${report.scenarios.length}, slicing ${report.budgets.sliceMaximumMs}ms, cancellation ${report.budgets.cancellationTargetMaximumMs}ms, worlds ${report.budgets.residentWorlds}, gaps ${report.budgets.gaps.length}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

/**
 * The transcript has no wall-clock value, no random value and no machine-local measurement, so
 * `--check` is an exact staleness check. Real slice cost lives in `cost.json` and is written only by
 * an explicit `--cost` run.
 */
if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (`${JSON.stringify(JSON.parse(saved), null, 2)}\n` !== json) {
    console.error(`Experiment worker report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Experiment worker report is current: ${output}`);
} else {
  await mkdir(evidence, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}

if (process.argv.includes('--cost')) {
  const samples = Number(argument('--samples') ?? 5);
  const cost = await reportModule.runExperimentWorkerCost(
    Number.isSafeInteger(samples) && samples > 0 ? samples : 5,
  );
  await mkdir(evidence, { recursive: true });
  await writeFile(costOutput, `${JSON.stringify(cost, null, 2)}\n`);
  await writeFile(costMarkdown, reportModule.experimentWorkerCostMarkdown(cost));
  console.log(
    `COST slices ${cost.slices}, slice ms ${cost.sliceMs.min}/${cost.sliceMs.median}/${cost.sliceMs.max} (min/median/max), over budget ${cost.overBudgetSlices}, batch ms ${cost.batchMs.min}/${cost.batchMs.median}/${cost.batchMs.max}`,
  );
  console.log(`Wrote ${costOutput}`);
  console.log(`Wrote ${costMarkdown}`);
}
