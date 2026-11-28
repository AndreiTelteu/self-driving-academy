#!/usr/bin/env node
/**
 * PBI 285 deterministic report: the real 227 plan/state machine, the real 228 material feedback and
 * replay, and the 207 recorder, over a deterministic 028 incident source. The script writes the
 * evidence files; `--check` fails when the checked-in report is stale. It never claims FPS or heap.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runLiveChaosReport } from '../tests/destructibles/live-chaos-report.ts';

const root = process.cwd();
const evidence = join(root, 'Docs', 'Evidence', '285-destructible-audio-replay');
const reportPath = join(evidence, 'report.json');
const markdownPath = join(evidence, 'report.md');
const check = process.argv.includes('--check');
const report = runLiveChaosReport();
const json = `${JSON.stringify(report, null, 2)}\n`;
const summary = report.summary;
const markdown = [
  '# 285 destructible decor, audio and replay — deterministic report',
  '',
  `Generated: ${report.generatedAt}`,
  `Contract: ${report.contract}`,
  `Level: ${report.level}`,
  `Checks: ${summary.pass}/${summary.total} passed, ${summary.fail} failed`,
  '',
  '## Plan',
  '',
  `- ${report.plan.definitions} definitions in ${report.plan.zones.length} playground zones (${report.plan.structuralIds} structural ids).`,
  ...report.plan.zones.map(
    (zone) =>
      `- ${zone.zoneId}: ${zone.kind}, ${zone.destructibles} destructibles, ${zone.entries} entries, ${zone.routes} routes.`,
  ),
  '',
  '## Material matrix',
  '',
  '| Archetype | Material | Rate | Gain | Tier | Move N·s | Break N·s | Fragments |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...report.matrix.map(
    (entry) =>
      `| ${entry.archetype} | ${entry.material} | ${entry.playbackRate} | ${entry.gain} | ${entry.tier} | ${entry.moveImpulseNs} | ${entry.breakImpulseNs} | ${entry.fragments} |`,
  ),
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
  '## Caps and reset',
  '',
  `- Objects ${report.caps.activeObjects}/${report.caps.objects}; fragments ${report.caps.activeFragments}/${report.caps.fragments}; impact voices ${report.caps.audioImpactVoices}; buffers ${report.caps.audioBuffers}.`,
  `- Resets: ${report.reset.resetCount}; restored ${report.reset.restored}; baseline ${report.reset.baseline}; XP unchanged ${report.reset.xpUnchanged}; profile unchanged ${report.reset.profileUnchanged}.`,
  `- Replay latest: ${report.reset.latest.destructionEvents} destruction, ${report.reset.latest.resetEvents} reset, order ${report.reset.latest.orderIdentical}, events ${report.reset.latest.eventsIdentical}, simulation steps ${report.reset.latest.stepsSimulation}, policy evaluations ${report.reset.latest.policyEvaluations}, awards ${report.reset.latest.awardsGranted}, learning artifacts ${report.reset.latest.learningArtifacts}.`,
  `- Structural boundary: ${report.reset.structural.untouched ? 'untouched' : 'CHANGED'}; overlaps ${report.reset.structural.overlaps.length}.`,
  '',
  '## Cost',
  '',
  'Structural ownership counters only. Wall-clock and heap measurements are written by the separate cost command in `cost.json`; FPS, GPU and hardware are not claimed.',
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
    console.error('285 report is stale; run npm run destructibles:live');
    process.exitCode = 1;
  } else {
    console.log(`285 report is current: ${summary.pass}/${summary.total} checks`);
  }
} else {
  mkdirSync(evidence, { recursive: true });
  writeFileSync(reportPath, json);
  writeFileSync(markdownPath, markdown);
  console.log(`285 report: ${summary.pass}/${summary.total} checks -> ${reportPath}`);
  if (summary.fail > 0) process.exitCode = 1;
}
