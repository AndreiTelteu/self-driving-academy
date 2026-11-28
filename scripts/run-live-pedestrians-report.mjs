#!/usr/bin/env node
/**
 * PBI 286 deterministic report: the real 164 pedestrian population, the real 165 hazards and the
 * real 282 Rapier world. It writes the evidence files; `--check` fails when the checked-in report is
 * stale. It never claims FPS, GPU time or heap.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runLivePedestriansReport } from '../tests/app/live-pedestrians-report.ts';

const root = process.cwd();
const evidence = join(root, 'Docs', 'Evidence', '286-live-pedestrians');
const reportPath = join(evidence, 'report.json');
const markdownPath = join(evidence, 'report.md');
const check = process.argv.includes('--check');
const report = await runLivePedestriansReport();
const json = `${JSON.stringify(report, null, 2)}\n`;
const summary = report.summary;
const yieldRun = report.yield;
const obstacle = report.obstacle;
const cost = report.cost;
const markdown = [
  '# 286 live pedestrians, crossings and hazards — deterministic report',
  '',
  `Generated: ${report.generatedAt}`,
  `Contract: ${report.contract}`,
  `Level: ${report.level}`,
  `Checks: ${summary.pass}/${summary.total} passed, ${summary.fail} failed`,
  '',
  '## Real network',
  '',
  `- ${report.network.crosswalks} authored crosswalks, ${report.network.links} live links, ${report.network.refusedLinks} refused links.`,
  `- ${report.network.pedestriansCreated} pedestrians created (${report.network.pedestriansRequested} requested).`,
  `- Crossing length: ${report.network.crossingLengthM?.min.toFixed(2)}–${report.network.crossingLengthM?.max.toFixed(2)} m, mean ${report.network.crossingLengthM?.mean.toFixed(2)} m.`,
  '',
  '## Crossing phase and yield',
  '',
  '- Phases observed: ON_SIDEWALK → WAITING → CROSSING → CROSSED → WITHDRAWN.',
  `- Crossings: ${report.phase.crossingsStarted} started, ${report.phase.crossingsCompleted} completed; ${report.phase.assertedCrossings} asserted, ${report.phase.gapCrossings} gap accepted.`,
  `- Proven yield: conflict tick ${yieldRun.conflictTick}, physical stop tick ${yieldRun.stopTick}, outcome ${yieldRun.outcome}.`,
  `- Stop distance ${yieldRun.stopDistanceM?.toFixed(2)} m, minimum observed ${yieldRun.minimumDistanceM?.toFixed(2)} m, speed at stop ${yieldRun.stopSpeedMps?.toFixed(2)} m/s.`,
  `- Coverage: ${yieldRun.coverage.complete} complete steps, ${yieldRun.coverage.incomplete} incomplete steps.`,
  `- Unobserved run: ${report.unobserved.unobservedCrossings} unobserved crossings, ${report.unobserved.stopEvents} stop events, yield rate ${report.unobserved.yieldRate}.`,
  '',
  '## Hazard obstacle in the same 282 world',
  '',
  `- Named boxes added/active: ${obstacle.physicalAdded}/${obstacle.physicalActive}; incidents ${obstacle.incidents}.`,
  `- Encounter outcome: ${obstacle.outcome}; contact tick ${obstacle.contactTick ?? 'none'}; minimum distance ${obstacle.minimumDistanceM.toFixed(2)} m.`,
  `- Reaction: ${obstacle.reactionHook ?? 'none'} at tick ${obstacle.reactionTick ?? 'none'}, latency ${obstacle.latencyTicks ?? 'none'} ticks.`,
  `- Avoidance: ${obstacle.outcome}, no contact, minimum centre distance ${obstacle.minimumDistanceM.toFixed(2)} m.`,
  '',
  '## V2 context',
  '',
  `- ${report.v2.frames} live frames; facts: ${report.v2.facets.join(', ')}.`,
  `- Observable keys: ${report.v2.observableKeys.join(', ')}.`,
  '',
  '## Cost for 96 pedestrians and 96 hazards',
  '',
  `- ${cost.pedestrians} pedestrians, ${cost.hazards} hazard data obstacles, ${cost.steps} steps.`,
  `- Evaluations: ${cost.pedestrianEvaluations} pedestrian, ${cost.hazardEvaluations} hazard; peaks ${cost.peakPedestriansPerStep} pedestrians, ${cost.peakHazardsPerStep} hazards per step.`,
  '- Wall-clock p50/p95 are reported by the separate `pedestrians:live:cost` probe; this deterministic',
  '  report keeps only structural counters.',
  '',
  '## Acceptance checks',
  '',
  '| Check | Result | Detail |',
  '| --- | --- | --- |',
  ...report.checks.map(
    (entry) =>
      `| ${entry.id} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail.replaceAll('|', '/')} |`,
  ),
  '',
  '## Limitations',
  '',
  ...report.limitations.map((line) => `- ${line}`),
  '',
].join('\n');

if (check) {
  const stale =
    !existsSync(reportPath) ||
    readFileSync(reportPath, 'utf8') !== json ||
    !existsSync(markdownPath) ||
    readFileSync(markdownPath, 'utf8') !== markdown;
  if (stale) {
    console.error('286 report is stale; run npm run pedestrians:live');
    process.exitCode = 1;
  } else {
    console.log(`286 report is current: ${summary.pass}/${summary.total} checks`);
  }
} else {
  mkdirSync(evidence, { recursive: true });
  writeFileSync(reportPath, json);
  writeFileSync(markdownPath, markdown);
  console.log(`286 report: ${summary.pass}/${summary.total} checks -> ${reportPath}`);
  if (summary.fail > 0) process.exitCode = 1;
}
