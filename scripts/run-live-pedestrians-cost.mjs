#!/usr/bin/env node
/**
 * PBI 286 cost probe. Run with `npm run pedestrians:live:cost`; `--expose-gc` is optional and only
 * affects the heap reading. The report never claims FPS, GPU time or hardware.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runLivePedestriansCost } from '../tests/app/live-pedestrians-cost.ts';

const root = process.cwd();
const evidence = join(root, 'Docs', 'Evidence', '286-live-pedestrians');
const costPath = join(evidence, 'cost.json');
const markdownPath = join(evidence, 'cost.md');
const cost = runLivePedestriansCost();
const json = `${JSON.stringify(cost, null, 2)}\n`;
const markdown = [
  '# 286 live pedestrians/hazards — cost',
  '',
  `Generated: ${cost.generatedAt}`,
  `Contract: ${cost.contract}`,
  '',
  '| Metric | Value |',
  '| --- | --- |',
  `| Pedestrians | ${cost.pedestrians} |`,
  `| Hazard data obstacles | ${cost.hazards} |`,
  `| Steps | ${cost.steps} |`,
  `| Wall time | ${cost.wallMs.toFixed(1)} ms |`,
  `| Per step mean / p50 / p95 / max | ${cost.perStepMs.mean.toFixed(3)} / ${cost.perStepMs.p50.toFixed(3)} / ${cost.perStepMs.p95.toFixed(3)} / ${cost.perStepMs.max.toFixed(3)} ms |`,
  `| Pedestrian / hazard evaluations | ${cost.evaluationCost.pedestrianEvaluations} / ${cost.evaluationCost.hazardEvaluations} |`,
  `| Peak pedestrians / hazards per step | ${cost.evaluationCost.peakPedestriansPerStep} / ${cost.evaluationCost.peakHazardsPerStep} |`,
  `| Heap after GC | ${cost.heap.gc ? `${(cost.heap.usedBytes / 1024 / 1024).toFixed(1)} MiB` : 'not measured (no --expose-gc)'} |`,
  '',
  'Software step cost only. The native Rapier step, renderer, FPS and GPU are owned by 282/260 and',
  'are not claimed here.',
  '',
].join('\n');

mkdirSync(evidence, { recursive: true });
writeFileSync(costPath, json);
writeFileSync(markdownPath, markdown);
console.log(
  `286 cost: ${cost.pedestrians} pedestrians, ${cost.hazards} hazards, p95 ${cost.perStepMs.p95.toFixed(3)} ms`,
);
