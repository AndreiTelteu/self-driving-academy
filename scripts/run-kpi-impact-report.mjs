import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '214-kpi-impact'),
  defaultOutput = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'economy', 'kpi-impact-report.ts')).href
  ),
  report = reportModule.runKpiImpactReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.kpiImpactReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
const scenarios = report.scenarios
  .map(
    (entry) =>
      `${entry.name} ${entry.revenueDirection}/${entry.ratingDirection} (${entry.revenueDelta}, ${entry.ratingDelta ?? 'n/a'})`,
  )
  .join('; ');
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, scenarios ${scenarios}, xp ${report.xp.beforeBalance} -> ${report.xp.afterBalance} (nivel ${report.xp.beforeLevel} -> ${report.xp.afterLevel}), negative credit refused ${report.xp.negativeCreditRefused}, duplicate reward ${report.xp.duplicateRewardXp} XP, feedback planes ${report.feedback.planes}, forbidden hits ${report.feedback.forbiddenHits}, HUD ${report.hud.frames} frames -> ${report.hud.reads} reads / ${report.hud.renders} renders / ${report.hud.planeUpdates} plane writes, determinism ${report.determinism.runs}/${report.determinism.equal}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (process.argv.includes('--check')) {
  const savedJson = await readFile(output, 'utf8'),
    savedMarkdown = await readFile(reportMarkdown, 'utf8');
  const stale = [];
  if (savedJson !== json) stale.push(output);
  if (savedMarkdown !== markdown) stale.push(reportMarkdown);
  if (stale.length > 0) {
    console.error(`KPI impact report is stale: ${stale.join(', ')}`);
    process.exitCode = 1;
  } else console.log(`KPI impact report is current: ${output}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
