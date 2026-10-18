import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { manyContacts } from '../tests/vehicles/physics-fixture.ts';

const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw new Error('Choose before or after');
const folder = `Docs/Evidence/026-wheel-dynamics/${phase}`;
try {
  await access(folder);
  throw new Error(`Immutable capture already exists: ${folder}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const paths = execFileSync('rg', ['--files', 'src/vehicles', 'src/sessions', 'src/rendering'], {
  encoding: 'utf8',
})
  .trim()
  .split(/\r?\n/)
  .map((path) => path.replaceAll('\\', '/'));
paths.push(
  'tests/vehicles/physics-fixture.ts',
  'scripts/benchmark-wheel-dynamics.mjs',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
paths.sort();
await mkdir(`${folder}/source`, { recursive: true });
await writeFile(`${folder}/source/.gitattributes`, '* -text\n');
const source = createHash('sha256'),
  inputs = [];
for (const path of paths) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  await mkdir(dirname(`${folder}/source/${path}`), { recursive: true });
  await copyFile(path, `${folder}/source/${path}`);
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat'));
const nativeBytes = await readFile(nativePath);
await writeFile(`${folder}/rapier-native-artifact.mjs`, nativeBytes);
const native = {
  resolvedPath: nativePath,
  bytes: nativeBytes.length,
  sha256: sha(nativeBytes),
  archive: `${folder}/rapier-native-artifact.mjs`,
};
const warmupTicks = 180,
  measuredTicks = 600,
  runs = [];
const channels = ['tick', 'controllerMs', 'stepMs', 'queryMs', 'bridgeMs', 'totalMs', 'projection'];
for (let pair = 0; pair < 5; pair++) {
  for (const observe of pair % 2 ? [true, false] : [false, true]) {
    const { world, inputs: commands } = await manyContacts(70);
    const identity = world.bodyIdentity('car-0');
    const samples = Object.fromEntries(
      channels.map((name) => [name, new Float64Array(observe ? measuredTicks : 0)]),
    );
    let report;
    try {
      for (let i = 0; i < warmupTicks; i++) world.step(commands, false);
      const start = performance.now();
      for (let i = 0; i < measuredTicks; i++) {
        const tickStart = observe ? performance.now() : 0;
        const costs = world.step(commands, observe);
        const projectionStart = observe ? performance.now() : 0;
        for (const id of commands.keys()) world.project(id);
        if (observe) {
          samples.projection[i] = performance.now() - projectionStart;
          samples.tick[i] = projectionStart - tickStart;
          for (const name of channels.slice(1, -1)) samples[name][i] = costs[name];
        }
      }
      const elapsedWallMs = performance.now() - start;
      const metrics = Object.fromEntries(
        channels.map((name) => {
          const data = samples[name];
          data.sort();
          return [
            name,
            Object.fromEntries(
              [0.5, 0.95, 0.99].map((p) => [
                `p${p * 100}`,
                observe ? data[Math.ceil(data.length * p) - 1] : null,
              ]),
            ),
          ];
        }),
      );
      report = {
        pair,
        observe,
        warmupTicks,
        measuredTicks,
        elapsedWallMs,
        metrics,
        sampleBytes: Object.values(samples).reduce((sum, data) => sum + data.byteLength, 0),
        physics: world.counts(),
        inputHash: sha(JSON.stringify([...commands])),
        physicalHash: sha(JSON.stringify([...commands.keys()].map((id) => world.project(id)))),
      };
    } finally {
      world.dispose();
      let disposedReadRejected = false;
      try {
        world.readBody(identity);
      } catch {
        disposedReadRejected = true;
      }
      const bodies = world.bodyResources(),
        collisions = world.collisionResources();
      if (
        bodies.entities ||
        bodies.subscriptions ||
        collisions.colliders ||
        !collisions.disposed ||
        !disposedReadRejected
      )
        throw new Error('Native fixture cleanup failed');
      if (report) report.cleanup = { bodies, collisions, disposedReadRejected };
    }
    runs.push(report);
  }
}
for (const input of inputs)
  if (sha(await readFile(input.path)) !== input.sha256)
    throw new Error(`Source changed during capture: ${input.path}`);
if (sha(await readFile(nativePath)) !== native.sha256)
  throw new Error('Native artifact changed during capture');
const report = {
  capturedAt: new Date().toISOString(),
  phase,
  fixture: '026-many-contact-projection-v1',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: source.digest('hex'),
  inputs,
  native,
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  budgetVersion: '203-initial-1',
  scope:
    'Unpaced real Rapier CPU; no browser/frame/FPS measurement. Four wheel poses per vehicle; no retained production history.',
  runs,
};
await writeFile(`${folder}/node.json`, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    saved: `${folder}/node.json`,
    sourceHash: report.sourceHash,
    runs: runs.length,
  }),
);
