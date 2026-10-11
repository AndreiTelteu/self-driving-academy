import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release } from 'node:os';
import { archiveCapture, assertFrozen, immutable, digest } from './wheel-capture-source.mjs';

const capture = process.argv[2];
if (!/^[a-z0-9-]+$/.test(capture ?? '')) throw new Error('Explicit fresh native capture required');
const folder = `Docs/Evidence/026-wheel-dynamics/${capture}`;
const binding = await archiveCapture(folder, 'laptop-before-current-paired');
await immutable(
  `${folder}/hardware.json`,
  await readFile('Docs/Evidence/026-wheel-dynamics/laptop-20261011-hardware.json'),
);
const budgets = JSON.parse(await readFile('Docs/performance-budgets.json'));
const before =
  await import('../Docs/Evidence/026-wheel-dynamics/before/source/tests/vehicles/physics-fixture.ts');
const current = await import('../tests/vehicles/physics-fixture.ts');
const runs = [];
for (let pair = 0; pair < 5; pair++) {
  for (const enabled of pair % 2 ? [true, false] : [false, true]) {
    const fixture = await (enabled ? current : before).manyContacts(70);
    const { world, inputs } = fixture;
    const channels = Object.fromEntries(['tick', 'projection', 'step'].map((key) => [key, []]));
    let run, cleanupFailed;
    try {
      for (let i = 0; i < 180; i++) world.step(inputs, false);
      for (let i = 0; i < 600; i++) {
        const start = performance.now();
        const cost = world.step(inputs, true);
        const projectionStart = performance.now();
        for (const id of inputs.keys()) world.project(id);
        channels.tick.push(projectionStart - start);
        channels.projection.push(performance.now() - projectionStart);
        channels.step.push(cost.stepMs);
      }
      const physical = [...inputs.keys()].map((id) =>
        Object.fromEntries(
          Object.entries(world.project(id)).filter(
            ([key]) => !['wheels', 'angularVelocityRadps'].includes(key),
          ),
        ),
      );
      run = {
        pair,
        enabled,
        warmupTicks: 180,
        measuredTicks: 600,
        channels,
        inputHash: digest(JSON.stringify([...inputs])),
        physicalHash: digest(JSON.stringify(physical)),
      };
    } finally {
      world.dispose();
      const cleanup = { bodies: world.bodyResources(), collisions: world.collisionResources() };
      cleanupFailed = Boolean(
        cleanup.bodies.entities ||
        cleanup.bodies.subscriptions ||
        cleanup.collisions.colliders ||
        !cleanup.collisions.disposed,
      );
      if (run) run.cleanup = cleanup;
    }
    if (cleanupFailed) throw new Error('Native cleanup failed');
    await immutable(`${folder}/run-${runs.length}.json`, run);
    runs.push(run);
  }
}
const p95 = (values) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
const pairs = Array.from({ length: 5 }, (_, pair) => {
  const baseline = runs.find((run) => run.pair === pair && !run.enabled);
  const after = runs.find((run) => run.pair === pair && run.enabled);
  if (baseline.inputHash !== after.inputHash || baseline.physicalHash !== after.physicalHash)
    throw new Error('BEFORE/current physical parity failed');
  const metrics = Object.fromEntries(
    ['tick', 'projection', 'step'].map((key) => [
      key,
      { beforeP95Ms: p95(baseline.channels[key]), afterP95Ms: p95(after.channels[key]) },
    ]),
  );
  if (metrics.tick.afterP95Ms > budgets.proposedBudgets.laptop.authoritativeTickP95Ms)
    throw new Error('Laptop tick budget exceeded');
  return { pair, metrics, physicalParity: true };
});
for (const metric of ['tick', 'projection']) {
  const confirmations = pairs.filter(
    ({ metrics }) =>
      metrics[metric].afterP95Ms > metrics[metric].beforeP95Ms * 1.1 &&
      metrics[metric].afterP95Ms - metrics[metric].beforeP95Ms > 1,
  ).length;
  if (confirmations >= 3) throw new Error(`Confirmed native regression: ${metric}`);
}
await assertFrozen(binding);
await immutable(`${folder}/summary.json`, {
  state: 'NATIVE_LAPTOP_PAIRED_PASS',
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  completedAt: new Date().toISOString(),
  binding,
  pairs,
  scope: 'Unpaced native CPU and ownership only; browser frame/GPU and full game not certified.',
});
console.log(JSON.stringify({ state: 'NATIVE_LAPTOP_PAIRED_PASS', folder, pairs }));
