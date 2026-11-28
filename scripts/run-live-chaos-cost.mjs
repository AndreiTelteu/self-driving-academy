#!/usr/bin/env node
/**
 * PBI 285 local cost probe. It measures the software step cost of the live destruction composition
 * and the ownership counters after 20 resets. It is deliberately separate from report.json and is
 * not an FPS, GPU or hardware claim.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createCompositionWorld } from '../src/app/composition-world.ts';
import { createAudioEngine, createFakeAudioBackend } from '../src/audio/index.ts';
import { createLiveChaos } from '../src/app/live-chaos.ts';

const world = createCompositionWorld();
const context = Object.freeze({
  schemaVersion: 1,
  units: 'SI',
  sessionId: 'session-285-cost',
  worldEpoch: 1,
});
const active = new Map();
const physics = {
  addObstacle(input) {
    if (active.size >= 96) return false;
    active.set(input.id, input);
    return true;
  },
  moveObstacle(id) {
    return active.has(id);
  },
  removeObstacle(id) {
    return active.delete(id);
  },
  hasObstacle(id) {
    return active.has(id);
  },
  readIncidents() {
    return [];
  },
  getStats() {
    return {
      obstacles: {
        active: active.size,
        capacity: 96,
        worldObstacles: 90,
        available: Math.max(0, 96 - 90 - active.size),
        added: 0,
        moved: 0,
        removed: 0,
        refused: 0,
      },
    };
  },
};
const backend = createFakeAudioBackend();
const engine = createAudioEngine({ backend });
engine.startFromUserGesture('KEYBOARD');
const chaos = createLiveChaos({
  context,
  layout: world.layout,
  physics,
  engine,
  clock: () => performance.now(),
  now: () => '2026-11-28T00:00:00.000Z',
});
const target = chaos.plan.definitions[0];
const vehicle = {
  vehicleId: 'cost-vehicle',
  driverKind: 'TAXI',
  positionM: target.initialTransform.positionM,
  yawRad: 0,
  speedMps: 8,
  controlMode: 'MANUAL',
  isPlayer: true,
};
const p95 = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.round(0.95 * (sorted.length - 1)))];
};
const mean = (values) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
const gc = typeof global.gc === 'function' ? global.gc : null;
if (gc) gc();
const heapBefore = process.memoryUsage().heapUsed;
const tickCosts = [];
const impactCosts = [];
const iterations = 2000;
const resetCycles = 20;
let tick = 1;
for (let index = 0; index < iterations; index += 1) {
  tick += 1;
  const started = performance.now();
  chaos.step({ tick, vehicles: [vehicle], listenerPositionM: target.initialTransform.positionM });
  tickCosts.push(performance.now() - started);
  if (index % 30 === 0) {
    const object = chaos.plan.definitions[index % chaos.plan.definitions.length];
    const before = performance.now();
    chaos.probeImpact({
      objectId: object.objectId,
      impulseNs: object.impactThreshold.breakImpulseNs * 1.2,
      tick,
    });
    impactCosts.push(performance.now() - before);
  }
}
const resetStart = performance.now();
for (let cycle = 0; cycle < resetCycles; cycle += 1) {
  const object = chaos.plan.definitions[cycle % chaos.plan.definitions.length];
  chaos.probeImpact({
    objectId: object.objectId,
    impulseNs: object.impactThreshold.breakImpulseNs * 1.2,
    tick,
  });
  tick += 5;
  chaos.reset(tick);
  tick += 5;
}
const resetMs = performance.now() - resetStart;
backend.advance(10_000);
engine.updateVehicle({
  entityId: 'cost-vehicle',
  speedMps: 0,
  loadFactor: 0,
  brakeFactor: 0,
  slipFactor: 0,
  distanceM: 0,
});
engine.releaseVehicle('cost-vehicle');
if (gc) gc();
const heapAfter = process.memoryUsage().heapUsed;
const stats = chaos.getStats();
const cost = {
  version: '285-live-chaos-cost-v1',
  generatedAt: '2026-11-28T00:00:00.000Z',
  level: 'targeted',
  measurement: 'SOFTWARE_STEP_AND_OWNERSHIP_COUNTERS',
  notMeasured: ['FPS', 'GPU', 'hardware', 'integrated frame budget'],
  iterations,
  steps: tick,
  tick: {
    samples: tickCosts.length,
    meanMs: mean(tickCosts),
    p95Ms: p95(tickCosts),
    maxMs: Math.max(...tickCosts),
  },
  impact: {
    samples: impactCosts.length,
    meanMs: mean(impactCosts),
    p95Ms: p95(impactCosts),
    maxMs: Math.max(...impactCosts),
  },
  reset: {
    cycles: resetCycles,
    totalMs: resetMs,
    meanMs: resetMs / resetCycles,
    chunks: chaos.replayChunks().length,
  },
  memory: {
    heapBytes: null,
    measuredHeapDeltaBytes: gc ? heapAfter - heapBefore : null,
    heapMeasurement: gc ? 'node --expose-gc heapUsed before/after' : 'NOT_MEASURED_WITHOUT_GC',
    ownership: {
      objects: stats.objects,
      fragments: stats.fragments.activeFragments,
      voices: stats.audio?.activeVoices ?? 0,
      buffers: stats.audio?.buffers ?? 0,
      audioBufferBytes: stats.audio?.bufferBytes ?? 0,
      recorderBytes: stats.recorder.chargedBytes,
      replayChunks: stats.recorder.replayChunks,
      physicalObstacles: stats.physicalObstacles,
      busEvents: stats.bus.retainedEvents,
    },
  },
  caps: stats.caps,
};
const evidence = join(process.cwd(), 'Docs', 'Evidence', '285-destructible-audio-replay');
mkdirSync(evidence, { recursive: true });
writeFileSync(join(evidence, 'cost.json'), `${JSON.stringify(cost, null, 2)}\n`);
writeFileSync(
  join(evidence, 'cost.md'),
  [
    '# 285 live destruction cost',
    '',
    `Measured: ${cost.generatedAt}`,
    `Level: ${cost.level}`,
    '',
    `- Tick step: mean ${cost.tick.meanMs.toFixed(4)} ms, p95 ${cost.tick.p95Ms.toFixed(4)} ms, max ${cost.tick.maxMs.toFixed(4)} ms over ${cost.tick.samples} steps.`,
    `- Injected impact: mean ${cost.impact.meanMs.toFixed(4)} ms, p95 ${cost.impact.p95Ms.toFixed(4)} ms over ${cost.impact.samples} impacts.`,
    `- Reset: ${cost.reset.meanMs.toFixed(4)} ms per reset over ${cost.reset.cycles} cycles.`,
    `- Heap: ${cost.memory.measuredHeapDeltaBytes === null ? 'NOT_MEASURED' : `${cost.memory.measuredHeapDeltaBytes} B delta`} (ownership counters are the reported memory).`,
    `- Caps: ${JSON.stringify(cost.caps)}.`,
    '',
    'FPS, GPU and hardware are not claimed by this probe.',
    '',
  ].join('\n'),
);
chaos.dispose();
engine.dispose();
console.log(
  `285 cost: step p95 ${cost.tick.p95Ms.toFixed(4)} ms, impact p95 ${cost.impact.p95Ms.toFixed(4)} ms -> Docs/Evidence/285-destructible-audio-replay/cost.json`,
);
